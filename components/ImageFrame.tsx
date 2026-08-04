import Image from "next/image";
import SignalPlate from "./SignalPlate";

/**
 * Displays an image inside a phosphor frame with a green-duotone tint and a
 * scanline overlay so photos live inside the CRT world.
 *
 * When `src` is empty it renders a procedural CRT alignment plate rather than an
 * empty box, so the layout looks finished today and upgrades itself the moment a
 * real file is dropped into /public/img. The plate never pretends to be the
 * missing image: it is visibly a test card, and its accessible name says so.
 * The aspect ratio is reserved either way to avoid CLS.
 */
export default function ImageFrame({
  src,
  alt,
  label,
  plate,
  ratio = "1 / 1",
}: {
  src?: string;
  alt: string;
  /** Shown inside the placeholder, e.g. "portrait.jpg". */
  label?: string;
  /** Seed for the procedural plate: normally the project slug. */
  plate?: string;
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
          <SignalPlate slug={plate ?? label ?? "signal"} label={alt} file={label} />
        </div>
      )}
      <div className="imgframe__scan" aria-hidden="true" />
    </div>
  );
}
