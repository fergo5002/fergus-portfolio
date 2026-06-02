import Image from "next/image";

/**
 * Displays an image inside a phosphor frame with a green-duotone tint and a
 * scanline overlay so photos live inside the CRT world. When `src` is empty,
 * renders a clearly-labelled placeholder box instead (so the user can drop a
 * real file into /public/img later). The aspect ratio is reserved to avoid CLS.
 */
export default function ImageFrame({
  src,
  alt,
  label,
  ratio = "1 / 1",
}: {
  src?: string;
  alt: string;
  /** Shown inside the placeholder box, e.g. "portrait.jpg". */
  label?: string;
  ratio?: string;
}) {
  return (
    <div className="imgframe" style={{ aspectRatio: ratio }}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 460px"
          className="imgframe__img"
        />
      ) : (
        <div className="imgframe__placeholder">
          <span className="imgframe__placeholder-mark" aria-hidden="true">
            ▦
          </span>
          <span>[ insert: {label ?? alt} ]</span>
        </div>
      )}
      <div className="imgframe__scan" aria-hidden="true" />
    </div>
  );
}
