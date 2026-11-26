import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExampleList } from '@/components/ExampleList';
import { supabase } from '@/lib/supabase';
import { BigButton, Body, color, Title } from '@/ui/kit';

type Company = { id: string; name: string };

/** 탭 '서류 예시': 캐피탈 회사를 고르면 그 회사 작성방법 예시 사진 */
export default function ExamplesTab() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [picked, setPicked] = useState<Company | null>(null);

  useFocusEffect(useCallback(() => {
    void supabase.from('capital_companies').select('id, name').eq('active', true).order('sort').order('name')
      .then(({ data }) => setCompanies((data ?? []) as Company[]));
  }, []));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Title>{picked ? picked.name : '서류 작성 예시'}</Title>
        {picked ? (
          <>
            <BigButton label="← 회사 목록" tone="plain" onPress={() => setPicked(null)} />
            <ExampleList companyId={picked.id} />
          </>
        ) : companies === null ? <Body sub>불러오는 중…</Body>
          : companies.length === 0 ? <Body sub>등록된 캐피탈 회사가 없어요.</Body>
          : (
            <View style={{ gap: 8 }}>
              {companies.map(c => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => setPicked(c)}
                  style={({ pressed }) => [{ minHeight: 56, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: color.line, backgroundColor: '#fff' }, pressed && { opacity: 0.7 }]}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: color.text }}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
      </ScrollView>
    </SafeAreaView>
  );
}
