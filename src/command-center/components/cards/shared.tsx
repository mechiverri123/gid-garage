export function MiniTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <div className="text-[11px] text-[#52616D] py-1">No results.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[#52616D] border-b border-white/5">
            {columns.map(c => <th key={c} className="text-left py-1.5 pr-3 font-normal">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/5">
              {r.map((cell, j) => <td key={j} className="py-1.5 pr-3 text-[#8899A6]">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeyValueGrid({ data }: { data: Record<string, any> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object');
  if (!entries.length) return null;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-white/5 py-1">
          <span className="text-[#52616D]">{k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
          <span className="text-[#F5F8FA]">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

export function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px] py-0.5">
      <span className="text-[#52616D]">{label}</span>
      <span className="text-[#F5F8FA] text-right">{value}</span>
    </div>
  );
}
