import { useLocalSearchParams } from 'expo-router';
import { Body, Screen, Title } from '@/ui/kit';

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Screen><Title>오더 상세</Title><Body sub>{id}</Body></Screen>;
}
