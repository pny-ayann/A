/**
 * 주소 검색 화면(모달) → 접수 화면으로 고른 주소를 돌려주는 작은 통로.
 * 접수 화면이 받을 함수를 걸어 두고 검색 화면을 열면, 검색 화면이 고른 주소로 그 함수를 부르고 닫힌다.
 */
let handler: ((address: string) => void) | null = null;

export function onAddressPicked(fn: (address: string) => void) {
  handler = fn;
}

export function pickAddress(address: string) {
  const h = handler;
  handler = null;
  h?.(address);
}
