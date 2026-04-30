import { z } from 'zod'

export const ResortSlug = z.string().regex(/^[a-z0-9-]{1,64}$/).brand<'ResortSlug'>()
export type ResortSlug = z.infer<typeof ResortSlug>

export const UpstreamHash = z.string().regex(/^[a-f0-9]{64}$/).brand<'UpstreamHash'>()
export type UpstreamHash = z.infer<typeof UpstreamHash>

export const ISOCountryCode = z.string().length(2).regex(/^[A-Z]{2}$/).brand<'ISOCountryCode'>()
export type ISOCountryCode = z.infer<typeof ISOCountryCode>

export const ISODateTimeString = z.iso.datetime({ offset: true }).brand<'ISODateTimeString'>()
export type ISODateTimeString = z.infer<typeof ISODateTimeString>
