export default function Background() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <div
        className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#ff4dc3] mix-blend-screen"
        style={{ animation: 'pulseBlur 10s infinite ease-in-out' }}
      />
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#5095fe] mix-blend-screen"
        style={{ animation: 'pulseBlur 10s infinite ease-in-out', animationDelay: '-5s' }}
      />
      <div
        className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full bg-[#591962] mix-blend-screen"
        style={{ animation: 'pulseBlur 10s infinite ease-in-out', animationDelay: '-2s' }}
      />
      {/* Grain Overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
