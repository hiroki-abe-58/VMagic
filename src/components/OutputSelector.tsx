import { useCallback, useEffect } from 'react';
import { selectOutputFile } from '../lib/tauri-commands';

interface OutputSelectorProps {
    inputPath: string | null;
    inputFilename: string | null;
    targetFps: number;
    outputPath: string;
    onOutputPathChange: (path: string) => void;
    isDisabled?: boolean;
}

export function OutputSelector({
    inputPath,
    inputFilename,
    targetFps,
    outputPath,
    onOutputPathChange,
    isDisabled
}: OutputSelectorProps) {

    // Generate default output path in the same directory as input
    useEffect(() => {
        if (inputPath && inputFilename && !outputPath) {
            // Get directory from input path
            const lastSlashIndex = inputPath.lastIndexOf('/');
            const inputDir = lastSlashIndex >= 0 ? inputPath.substring(0, lastSlashIndex) : '';

            // Generate output filename
            const baseName = inputFilename.replace(/\.[^/.]+$/, '');
            const outputFilename = `${baseName}_${targetFps}fps.mp4`;

            // Combine directory and filename
            const fullOutputPath = inputDir ? `${inputDir}/${outputFilename}` : outputFilename;
            onOutputPathChange(fullOutputPath);
        }
    }, [inputPath, inputFilename, targetFps, outputPath, onOutputPathChange]);

    // Update output path when target fps changes (keep same directory)
    useEffect(() => {
        if (outputPath && inputFilename) {
            const lastSlashIndex = outputPath.lastIndexOf('/');
            const outputDir = lastSlashIndex >= 0 ? outputPath.substring(0, lastSlashIndex) : '';

            const baseName = inputFilename.replace(/\.[^/.]+$/, '');
            const newFilename = `${baseName}_${targetFps}fps.mp4`;

            const newOutputPath = outputDir ? `${outputDir}/${newFilename}` : newFilename;

            // Only update if the filename part changed (fps changed)
            if (newOutputPath !== outputPath) {
                onOutputPathChange(newOutputPath);
            }
        }
    }, [targetFps, inputFilename]);

    const handleSelectFile = useCallback(async () => {
        if (isDisabled) return;

        const defaultName = inputFilename
            ? `${inputFilename.replace(/\.[^/.]+$/, '')}_${targetFps}fps.mp4`
            : `output_${targetFps}fps.mp4`;

        const path = await selectOutputFile(defaultName);
        if (path) {
            onOutputPathChange(path);
        }
    }, [inputFilename, targetFps, isDisabled, onOutputPathChange]);

    // Extract just filename for display
    const displayName = outputPath.split('/').pop() || outputPath;
    const displayPath = outputPath.includes('/')
        ? outputPath.substring(0, outputPath.lastIndexOf('/'))
        : '';

    return (
        <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                </svg>
                出力先
            </h2>

            <div className="space-y-3">
                {/* Output path display */}
                <div className="bg-dark-surface-light rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-text-muted flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        <div className="flex-1 min-w-0">
                            <p className="text-text-primary font-mono text-sm break-all" title={outputPath}>
                                {displayName || '出力ファイルを選択してください'}
                            </p>
                            {displayPath && (
                                <p className="text-xs text-text-muted break-all mt-1" title={displayPath}>
                                    {displayPath}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info text */}
                <p className="text-xs text-text-muted">
                    入力ファイルと同じフォルダに保存されます
                </p>

                {/* Select button */}
                <button
                    onClick={handleSelectFile}
                    disabled={isDisabled}
                    className={`
            w-full py-3 px-4 rounded-lg border border-dark-border
            bg-dark-surface-light text-text-primary
            hover:border-neon-yellow/50 hover:bg-dark-surface-light/80
            transition-all duration-200 flex items-center justify-center gap-2
            ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                        />
                    </svg>
                    別の保存先を選択
                </button>
            </div>
        </div>
    );
}
