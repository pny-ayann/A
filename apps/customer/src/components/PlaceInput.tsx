import type { Place } from '@takson/shared';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { geocode } from '@/lib/kakao';
import { onAddressPicked } from '@/lib/newOrder/pick';
import { BigButton, Body, Card, color, Field } from '@/ui/kit';

/** 출발지·경유지·도착지 하나: 자주 쓰는 주소 칩 또는 주소 검색 → 상세주소·담당자·연락처 */
export function PlaceInput({ title, value, onChange, top, onRemove }: {
  title: string;
  value: Place;
  onChange: (p: Place) => void;
  top: Place[];
  onRemove?: () => void;
}) {
  const [finding, setFinding] = useState(false);

  function search() {
    onAddressPicked(async address => {
      setFinding(true);
      onChange({ ...value, address, area: null, lat: null, lng: null });
      const g = await geocode(address);
      setFinding(false);
      onChange({ ...value, address, area: g?.area ?? null, lat: g?.lat ?? null, lng: g?.lng ?? null });
    });
    router.push('/address-search' as Href);
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: color.text }}>{title}</Text>
        {onRemove && (
          <Pressable accessibilityRole="button" accessibilityLabel={`${title} 지우기`} onPress={onRemove} hitSlop={12}>
            <Text style={{ fontSize: 16, color: color.danger, fontWeight: '600' }}>지우기</Text>
          </Pressable>
        )}
      </View>

      {value.address ? (
        <View style={{ gap: 2 }}>
          <Body>{value.address}</Body>
          <Body sub>{finding ? '위치 찾는 중…' : value.lat ? value.area ?? '' : '지도에서 위치를 못 찾았어요 (요금은 직접 넣어 주세요)'}</Body>
        </View>
      ) : top.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {top.map((p, i) => (
            <Pressable key={i} accessibilityRole="button" onPress={() => onChange(p)}
              style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: color.line, backgroundColor: '#fff', maxWidth: 240 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, color: color.text }}>{p.detail ? `${p.address} ${p.detail}` : p.address}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <BigButton label={value.address ? '주소 다시 찾기' : '주소 검색'} tone="plain" onPress={search} />
      {value.address ? (
        <>
          <Field label="상세주소" value={value.detail} onChangeText={detail => onChange({ ...value, detail })} placeholder="동·호수, 주차 위치" />
          <Field label="담당자" value={value.contactName} onChangeText={contactName => onChange({ ...value, contactName })} />
          <Field label="연락처" value={value.contactPhone} onChangeText={contactPhone => onChange({ ...value, contactPhone })} keyboardType="phone-pad" />
        </>
      ) : null}
    </Card>
  );
}
