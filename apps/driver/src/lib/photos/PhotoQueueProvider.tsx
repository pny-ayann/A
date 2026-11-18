import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { currentPosition } from '../location/current';
import { compressPhoto } from './image';
import { supabase } from '../supabase';
import { applyResult, due, enqueue, pendingCount, resolveDrop, retryNow, type Phase, type QueueItem, type Slot } from './queue';
import { deleteLocal, uploadOne } from './uploader';

const KEY = 'photo-queue-v1';

export type Shot = { uri: string; width: number; height: number };
type Add = { kind: 'photo'; orderId: string; phase: Phase; slot: Slot | null } | { kind: 'receipt'; orderId: string; amount: number };

type Ctx = {
  items: QueueItem[];
  pending: (orderId: string, phase?: Phase) => number;
  add: (shot: Shot, what: Add) => Promise<void>;
  /** 올라간 횟수 — 바뀌면 화면이 서버 사진 상태를 다시 읽는다 */
  uploadedTick: number;
  /** 회수·취소로 포기한 사진이 있으면 안내 문구 */
  dropNotice: string | null;
  clearDropNotice: () => void;
};

const PhotoQueueCtx = createContext<Ctx | null>(null);

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
  const ref = useRef<QueueItem[]>([]);
  const running = useRef(false);

  const save = useCallback((q: QueueItem[]) => {
    ref.current = q;
    setItems(q);
    void AsyncStorage.setItem(KEY, JSON.stringify(q)).catch(() => {});
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (const i of due(ref.current, Date.now())) {
        const first = await uploadOne(i);
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
    void AsyncStorage.getItem(KEY).then(raw => {
      const q = raw ? (JSON.parse(raw) as QueueItem[]) : [];
      ref.current = q;
      setItems(q);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

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
    const posP = currentPosition(2_000);
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
      attempts: 0, nextTryAt: 0,
    };
    // 같은 칸을 다시 찍었으면 예전 파일은 지운다
    const replaced = ref.current.find(x => x.kind === 'photo' && x.slot && x.slot === item.slot && x.orderId === item.orderId && x.phase === item.phase);
    if (replaced) deleteLocal(replaced.localUri);
    save(enqueue(ref.current, item));
    void run();
  }, [run, save]);

  const value: Ctx = {
    items,
    pending: (orderId, phase) => pendingCount(items, orderId, phase),
    add,
    uploadedTick,
    dropNotice,
    clearDropNotice: () => setDropNotice(null),
  };
  return <PhotoQueueCtx.Provider value={value}>{children}</PhotoQueueCtx.Provider>;
}

export function usePhotoQueue(): Ctx {
  const v = useContext(PhotoQueueCtx);
  if (!v) throw new Error('PhotoQueueProvider 밖에서 usePhotoQueue를 썼어요');
  return v;
}
