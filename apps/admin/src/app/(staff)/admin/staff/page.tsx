import { AccountFields, ActionForm, inputCls } from '@/components/ActionForm';
import { issueAccount, setStaffLevel } from '@/lib/accounts/actions';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

export default async function StaffPage() {
  const supabase = await serverClient();
  const me = await getStaffProfile();
  const { data } = await supabase.from('profiles').select('id, login_id, name, phone, staff_level')
    .eq('role', 'staff').order('login_id');
  return (
    <div className="max-w-4xl space-y-8">
      <section>
        <h1 className="mb-1 text-xl font-bold">관제 직원 계정</h1>
        <p className="mb-4 text-sm text-slate-600">관리자는 요금·업체·기사·직원까지 모두 관리해요. 일반 관제는 오더 관제와 접수만 해요.</p>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-slate-600"><th className="py-2">이름</th><th>아이디</th><th>전화</th><th>등급</th></tr></thead>
          <tbody>
            {(data ?? []).map(s => (
              <tr key={s.id} className="border-b">
                <td className="py-1.5">{s.name}</td>
                <td className="text-slate-500">{s.login_id}</td>
                <td>{s.phone}</td>
                <td>
                  {s.id === me?.id ? (
                    <span>{s.staff_level === 'admin' ? '관리자' : '일반 관제'} (나)</span>
                  ) : (
                    <ActionForm action={setStaffLevel} submit="변경">
                      <input type="hidden" name="id" value={s.id} />
                      <select name="staffLevel" defaultValue={s.staff_level ?? 'operator'} aria-label="등급" className={inputCls}>
                        <option value="operator">일반 관제</option>
                        <option value="admin">관리자</option>
                      </select>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="border-t pt-6">
        <h2 className="mb-3 text-lg font-bold">직원 계정 발급</h2>
        <ActionForm action={issueAccount} submit="발급" primary>
          <input type="hidden" name="role" value="staff" />
          <AccountFields />
          <select name="staffLevel" defaultValue="operator" aria-label="새 계정 등급" className={inputCls}>
            <option value="operator">일반 관제</option>
            <option value="admin">관리자</option>
          </select>
        </ActionForm>
      </section>
    </div>
  );
}
