import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { currentPosition } from '../location/current';
import { compressPhoto } from './image';
import { supabase } from '../supabase';
import { applyResult, due, enqueue, pendingCount, resolveDrop, retryNow, stillQueued, type Lost, type Phase, type QueueItem } from './queue';
import { deleteLocal, uploadOne } from './uploader';

const KEY = 'photo-queue-v1';

export type Shot = { uri: string; width: number; height: number };
type Add = { kind: 'photo'; orderId: string; phase: Phase; slot: string | null; fromGallery?: boolean } | { kind: 'receipt'; orderId: string; amount: number };

type Ctx = {
  items: QueueItem[];
  pending: (orderId: string, phase?: Phase) => number;
  add: (shot: Shot, what: Add) => Promise<void>;
  /** 올라간 횟수 — 바뀌면 화면이 서버 사진 상태를 다시 읽는다 */
  uploadedTick: number;
  /** 회수·취소로 포기한 사진이 있으면 안내 문구 */
  dropNotice: string | null;
  clearDropNotice: () => void;
  /** 휴대폰에서 파일을 잃어 못 올린 칸 (빨간 칸으로 표시) */
  lost: Lost[];
};

const PhotoQueueCtx = createContext<Ctx | null>(null);

const sameLost = (l: Lost, i: { orderId: string; phase: Phase | null; slot: string | null }) =>
  l.orderId === i.orderId && l.phase === i.phase && l.slot === i.slot;

/**
 * 서버가 거부했을 때 정말 버릴지 확인: 로그인돼 있고 오더가 더는 내 것이 아닐 때만 버린다.
 * (신호가 나빠 로그인 갱신이 실패한 경우, 로그아웃 중인 경우에는 사진을 지키고 나중에 다시 시도)
 */
async function confirmDrop(orderId: string): Promise<'retry' | 'drop'> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return resolveDrop({ hasSession: false, stillMine: true });
  const { data, error } = await supabase.from('orders').select('id').eq('id', orderId).eq('driver_id', uid).maybeSingle();
  return resolveDrop({ hasSession: true, stillMine: !!error || !!data });
}

/** 찍은 사진을 앱 전용 폴더로 옮겨 캐시가 지워져도 남게 한다 (웹은 개발 확인용이라 그대로) */
function keepFile(uri: string, id: string): string {
  if (Platform.OS === 'web') return uri;
  const dir = new Directory(Paths.document, 'queue');
  if (!dir.exists) dir.create();
  const dest = new File(dir, `${id}.jpg`);
  new File(uri).move(dest);
  return dest.uri;
}

export function PhotoQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploadedTick, setUploadedTick] = useState(0);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const [lost, setLost] = useState<Lost[]>([]);
  const ref = useRef<QueueItem[]>([]);
  const running = useRef(false);

  const restored = useRef(false);
  const save = useCallback((q: QueueItem[]) => {
    ref.current = q;
    setItems(q);
    // 복원 전에 쓰면 저장된 대기열을 덮어쓴다
    if (!restored.current) return;
    void AsyncStorage.setItem(KEY, JSON.stringify(q)).catch(e => console.warn('사진 대기열 저장 실패', e));
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (const i of due(ref.current, Date.now())) {
        // 올리는 도중 같은 칸을 다시 찍었으면 옛것은 이미 빠졌고 파일도 지워졌다 — 건너뛴다
        if (!stillQueued(ref.current, i.id)) continue;
        const first = await uploadOne(i);
        if (first === 'gone') {
          const slot = i.slot;
          if (slot) setLost(l => [...l.filter(x => !sameLost(x, i)), { orderId: i.orderId, phase: i.phase, slot }]);
          setDropNotice(slot
            ? '휴대폰에서 사진 파일을 찾지 못한 칸이 있어요. 빨간 칸을 다시 찍어 주세요.'
            : '휴대폰에서 사진 파일을 찾지 못해 올리지 못한 추가 사진이 있어요. 다시 찍어 주세요.');
          save(applyResult(ref.current, i.id, 'drop', Date.now()));
          continue;
        }
        const r = first === 'denied' ? await confirmDrop(i.orderId) : first;
        if (r !== 'retry') deleteLocal(i.localUri);
        if (r === 'drop') setDropNotice('관제가 오더를 회수·취소해서 올리지 못한 사진이 있어요.');
        save(applyResult(ref.current, i.id, r, Date.now()));
        if (r === 'ok') setUploadedTick(t => t + 1);
        if (r === 'retry') break; // 신호가 없으면 나머지도 실패하니 다음 차례에
      }
    } finally {
      running.current = false;
    }
  }, [save]);

  // 앱을 켤 때 대기열 복원
  useEffect(() => {
    let stop = false;
    const restore = async () => {
      let raw: string | null;
      try { raw = await AsyncStorage.getItem(KEY); } catch {
        // 못 읽으면 덮어쓰지 말고 잠시 뒤 다시
        if (!stop) setTimeout(() => void restore(), 3_000);
        return;
      }
      let stored: QueueItem[] = [];
      try { stored = raw ? (JSON.parse(raw) as QueueItem[]) : []; } catch {
        // 깨진 기록은 지우지 않고 따로 남긴다
        await AsyncStorage.setItem(`${KEY}-broken-${Date.now()}`, raw ?? '').catch(() => {});
      }
      if (stop) return;
      restored.current = true;
      // 복원 중에 새로 찍은 사진도 함께 둔다
      save([...stored, ...ref.current.filter(n => !stored.some(s => s.id === n.id))]);
      setLoaded(true);
    };
    void restore();
    return () => { stop = true; };
  }, [save]);

  // 10초마다, 신호가 돌아올 때, 앱이 앞으로 올 때 올리기
  useEffect(() => {
    if (!loaded) return;
    void run();
    const t = setInterval(() => void run(), 10_000);
    const net = NetInfo.addEventListener(s => {
      if (s.isConnected) { save(retryNow(ref.current, Date.now())); void run(); }
    });
    const app = AppState.addEventListener('change', s => { if (s === 'active') void run(); });
    return () => { clearInterval(t); net(); app.remove(); };
  }, [loaded, run, save]);

  const add = useCallback(async (shot: Shot, what: Add) => {
    const id = randomUUID();
    // 위치는 압축과 동시에, 길어야 2초만 (지하에서 한 장마다 10초씩 기다리지 않게)
    const fromGallery = what.kind === 'photo' && !!what.fromGallery;
    // 갤러리 사진은 지금 위치가 찍은 곳이 아니니 위치를 붙이지 않는다
    const posP = fromGallery ? Promise.resolve(null) : currentPosition(2_000);
    const small = await compressPhoto(shot.uri, shot.width, shot.height);
    const pos = await posP;
    // 파일을 옮긴 바로 뒤에 대기열에 저장해, 그 사이 앱이 꺼져 사진이 길을 잃지 않게 한다
    const localUri = keepFile(small, id);
    const item: QueueItem = {
      id, kind: what.kind, orderId: what.orderId,
      phase: what.kind === 'photo' ? what.phase : null,
      slot: what.kind === 'photo' ? what.slot : null,
      amount: what.kind === 'receipt' ? what.amount : null,
      localUri, takenAt: new Date().toISOString(), lat: pos?.lat ?? null, lng: pos?.lng ?? null,
      attempts: 0, nextTryAt: 0, source: fromGallery ? 'gallery' : 'camera',
    };
    // 같은 칸을 다시 찍었으면 예전 파일은 지운다
    const replaced = ref.current.find(x => x.kind === 'photo' && x.slot && x.slot === item.slot && x.orderId === item.orderId && x.phase === item.phase);
    if (replaced) deleteLocal(replaced.localUri);
    save(enqueue(ref.current, item));
    setLost(l => l.filter(x => !sameLost(x, item))); // 다시 찍었으니 빨간 칸 해제
    void run();
  }, [run, save]);

  const value: Ctx = {
    items,
    pending: (orderId, phase) => pendingCount(items, orderId, phase),
    add,
    uploadedTick,
    dropNotice,
    clearDropNotice: () => setDropNotice(null),
    lost,
  };
  return <PhotoQueueCtx.Provider value={value}>{children}</PhotoQueueCtx.Provider>;
}

export function usePhotoQueue(): Ctx {
  const v = useContext(PhotoQueueCtx);
  if (!v) throw new Error('PhotoQueueProvider 밖에서 usePhotoQueue를 썼어요');
  return v;
}
