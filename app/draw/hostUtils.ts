export function formatCurrency(amount: number) {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

export function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("vi-VN");
}
