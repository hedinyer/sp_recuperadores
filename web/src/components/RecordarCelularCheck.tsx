type RecordarCelularCheckProps = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function RecordarCelularCheck({
  id,
  checked,
  onChange,
}: RecordarCelularCheckProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-2.5 cursor-pointer select-none"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 rounded border-zinc-600 bg-zinc-800 accent-emerald-600"
      />
      <span>
        <span className="text-sm text-zinc-200">Recordar este celular</span>
        <span className="block text-[11px] text-zinc-500">
          En este teléfono ya no se pedirá la clave
        </span>
      </span>
    </label>
  );
}
