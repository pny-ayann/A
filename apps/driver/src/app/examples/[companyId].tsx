import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { ExampleList } from '@/components/ExampleList';
import { color } from '@/ui/kit';

/** 오더에서 바로 여는 그 회사 작성방법 예시 */
export default function CompanyExamples() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  return (
    <ScrollView style={{ backgroundColor: color.bg }} contentContainerStyle={{ padding: 16 }}>
      <ExampleList companyId={companyId} />
    </ScrollView>
  );
}
