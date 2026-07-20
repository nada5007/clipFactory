// API 키 설정 UI에서 저장된 값을 화면에 되돌려 보낼 때, 실제 값은 절대 노출하지 않고 일부만 보여준다.
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  const visible = 4;
  return `${value.slice(0, visible)}${"•".repeat(value.length - visible * 2)}${value.slice(-visible)}`;
}
