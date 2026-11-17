import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { resizeTarget } from './resize';

/** 찍은 사진을 긴 변 1600px, JPEG 압축 0.6으로 줄인다 (장당 약 200~300KB) */
export async function compressPhoto(uri: string, width: number, height: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const size = resizeTarget(width, height);
  if (size) ctx.resize('width' in size ? { width: size.width, height: null } : { width: null, height: size.height });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.6 });
  return out.uri;
}

/** 업로드용으로 파일 내용을 읽는다 (휴대폰은 파일, 웹은 blob 주소) */
export async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}
