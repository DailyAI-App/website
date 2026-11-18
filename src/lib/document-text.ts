import { OfficeParser } from "officeparser";

const SUPPORTED_EXTENSIONS = [".pdf", ".pptx"];

export function isSupportedLectureFile(file: File): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

// PDF and PPTX are both detected from their own content, so no fileType hint
// is needed — see officeparser's buffer-detection notes.
export async function extractLectureText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ast = await OfficeParser.parseOffice(buffer);
  const { value } = await ast.to("text");
  return value.trim();
}
