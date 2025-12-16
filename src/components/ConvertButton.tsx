interface ConvertButtonProps {
  onClick: () => void;
  isDisabled: boolean;
  isConverting: boolean;
}

export function ConvertButton({ onClick, isDisabled, isConverting }: ConvertButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isDisabled || isConverting}
      className={`
        w-full py-4 px-6 rounded-xl font-semibold text-lg
        transition-all duration-300 flex items-center justify-center gap-3
        btn-primary
        ${isDisabled || isConverting
          ? 'bg-dark-surface-light text-text-muted cursor-not-allowed border border-dark-border'
          : 'bg-neon-yellow text-dark-bg hover:bg-neon-yellow-bright active:scale-[0.98] shadow-lg shadow-neon-yellow/20'
        }
      `}
    >
      {isConverting ? (
        <>
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
            />
          </svg>
          <span>変換中...</span>
        </>
      ) : (
        <>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M13 10V3L4 14h7v7l9-11h-7z" 
            />
          </svg>
          <span>変換を開始</span>
        </>
      )}
    </button>
  );
}

