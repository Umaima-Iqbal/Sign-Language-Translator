export default function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl font-extrabold text-white shadow-lg select-none"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(120deg, #0aa7c8, #8a5cff 55%, #ff4fd8)',
        fontSize: size * 0.42,
      }}
    >
      SB
    </div>
  );
}
