import logoUrl from '../assets/logo.webp';

/** Brasão do Resenha05. `size` é a altura em px (o brasão é mais alto que largo). */
export function Logo({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="Resenha05"
      draggable={false}
      style={{ height: size, width: 'auto' }}
      className={['block select-none', className].filter(Boolean).join(' ')}
    />
  );
}
