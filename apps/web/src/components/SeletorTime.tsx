import { NOMES_TIMES, acharTime, siglaTime } from '@resenha05/shared';
import { Input } from './ui';

/**
 * Campo "time do coração" com autocomplete dos times conhecidos e uma prévia
 * das cores que a cartinha vai usar.
 */
export function SeletorTime({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const tema = acharTime(value);
  const digitou = value.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      <Input
        list="times-lista"
        value={value}
        placeholder="Ex.: Flamengo"
        maxLength={60}
        onChange={(e) => onChange(e.target.value)}
        // "fla" / "timão" viram o nome oficial ao sair do campo
        onBlur={() => tema && value !== tema.nome && onChange(tema.nome)}
      />
      <datalist id="times-lista">
        {NOMES_TIMES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {tema ? (
        <div className="flex items-center gap-2.5 text-xs text-tinta-soft">
          <span
            className="grid h-9 w-8 shrink-0 place-items-center overflow-hidden rounded-b-[14px] rounded-t-[4px] border-2 font-display text-[0.7rem] font-extrabold"
            style={{ borderColor: tema.destaque, background: tema.primaria, color: '#fff' }}
            aria-hidden
          >
            {siglaTime(tema)}
          </span>
          <span className="flex gap-1" aria-hidden>
            {[tema.primaria, tema.secundaria, tema.terciaria]
              .filter((c): c is string => Boolean(c))
              .map((c) => (
                <span key={c} className="h-3.5 w-3.5 rounded-full ring-1 ring-tinta-line" style={{ background: c }} />
              ))}
          </span>
          <span>Sua cartinha vai nas cores do {tema.nome}.</span>
        </div>
      ) : digitou ? (
        <p className="text-xs text-tinta-faint">
          Não conheço esse time ainda — a cartinha fica no ouro do Resenha05.
        </p>
      ) : (
        <p className="text-xs text-tinta-faint">A cartinha usa as cores e o escudo do seu time.</p>
      )}
    </div>
  );
}
