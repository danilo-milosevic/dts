/**
 * Save a file from the server with a "Save as" dialog (choose folder + name).
 * Uses the File System Access API (Chrome / Edge, on localhost or https). Elsewhere it falls back to a normal
 * browser download with the suggested name — the browser's "ask where to save" setting decides about the dialog.
 */
type Picker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ name: string; createWritable: () => Promise<WritableStream> }>;

export type SaveResult = { status: 'saved'; name: string } | { status: 'downloading'; name: string } | { status: 'cancelled' };

export async function saveFromServer(url: string, suggestedName: string, type: { description: string; mime: string; ext: string }): Promise<SaveResult> {
  const picker = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  if (picker) {
    let handle;
    try {
      // must open before any await so it still counts as a user gesture
      handle = await picker({ suggestedName, types: [{ description: type.description, accept: { [type.mime]: [type.ext] } }] });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return { status: 'cancelled' };
      throw e;
    }
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error((await res.text().catch(() => '')) || `Download failed (${res.status})`);
    await res.body.pipeTo(await handle.createWritable());
    return { status: 'saved', name: handle.name };
  }
  const a = document.createElement('a'); a.href = url; a.download = suggestedName; document.body.appendChild(a); a.click(); a.remove();
  return { status: 'downloading', name: suggestedName };
}
