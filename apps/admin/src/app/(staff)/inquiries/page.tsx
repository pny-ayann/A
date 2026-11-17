import { InquiryList } from './InquiryList';

export default function InquiriesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="text-xl font-bold">문의</h1>
      <p className="text-sm text-slate-500">안 읽은 문의가 있는 오더예요. 누르면 오더 상세에서 답장할 수 있어요.</p>
      <InquiryList />
    </div>
  );
}
