/** 메뉴가 지금 화면인지: 같은 주소이거나 그 아래 화면(상세 등). except 아래는 다른 메뉴 몫 */
export function isActive(path: string, href: string, except: string[] = []): boolean {
  if (except.some(e => path === e || path.startsWith(`${e}/`))) return false;
  return path === href || path.startsWith(`${href}/`);
}
