export function isoLocalToUtc(isoLocal: string) {
    const d = new Date(isoLocal)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
}
