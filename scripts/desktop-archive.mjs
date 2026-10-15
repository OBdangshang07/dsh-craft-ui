// Read one bounded, packed text entry from an installed Electron ASAR.
// The canary uses this only for the shipped Desktop caption-menu implementation.
import { open } from 'node:fs/promises'

export async function desktopArchiveText(archive, path) {
  const file = await open(archive, 'r')
  try {
    const prefix = Buffer.alloc(16)
    await file.read(prefix,0,16,0)
    const headerSize=prefix.readUInt32LE(4), length=prefix.readUInt32LE(12)
    if (length>32*1024*1024 || length>headerSize) throw new Error('Invalid Desktop archive header')
    const bytes=Buffer.alloc(length)
    await file.read(bytes,0,length,16)
    let entry=JSON.parse(bytes.toString('utf8'))
    for (const part of path.split('/')) entry=entry.files?.[part]
    if (!entry || entry.unpacked || entry.link || !Number.isSafeInteger(entry.size) || entry.size>4*1024*1024) throw new Error('Missing/unsupported Desktop text entry')
    const content=Buffer.alloc(entry.size)
    const offset=Number(entry.offset)
    if (!Number.isSafeInteger(offset) || offset<0) throw new Error('Invalid Desktop entry offset')
    await file.read(content,0,content.length,8+headerSize+offset)
    return content.toString('utf8')
  } finally { await file.close() }
}
