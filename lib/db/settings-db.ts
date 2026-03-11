import { supabase } from '../supabase'
import { redis } from '../redis'
import { AppSettings } from '../../types'

const SETTINGS_CACHE_PREFIX = 'settings:'
const SETTINGS_CACHE_TTL = 60 // segundos

export const settingsDb = {
    get: async (key: string): Promise<string | null> => {
        const cacheKey = `${SETTINGS_CACHE_PREFIX}${key}`

        if (redis) {
            try {
                const cached = await redis.get<string>(cacheKey)
                if (cached !== null) {
                    return cached
                }
            } catch (e) {
                console.warn('[settingsDb] Redis read error:', e)
            }
        }

        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', key)
            .single()

        if (error || !data) return null

        if (redis && data.value) {
            try {
                await redis.set(cacheKey, data.value, { ex: SETTINGS_CACHE_TTL })
            } catch (e) {
                console.warn('[settingsDb] Redis write error:', e)
            }
        }

        return data.value
    },

    set: async (key: string, value: string): Promise<void> => {
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('settings')
            .upsert({
                key,
                value,
                updated_at: now,
            }, { onConflict: 'key' })

        if (error) throw error

        if (redis) {
            try {
                const cacheKey = `${SETTINGS_CACHE_PREFIX}${key}`
                await redis.del(cacheKey)
            } catch (e) {
                console.warn('[settingsDb] Redis del error:', e)
            }
        }
    },

    getAll: async (): Promise<AppSettings> => {
        const { data, error } = await supabase
            .from('settings')
            .select('key, value')

        if (error) throw error

        const settings: Record<string, string> = {}
            ; (data || []).forEach((row: any) => {
                settings[row.key] = row.value
            })

        return {
            phoneNumberId: settings.phoneNumberId || '',
            businessAccountId: settings.businessAccountId || '',
            accessToken: settings.accessToken || '',
            isConnected: settings.isConnected === 'true',
        }
    },

    saveAll: async (settings: AppSettings): Promise<void> => {
        await settingsDb.set('phoneNumberId', settings.phoneNumberId)
        await settingsDb.set('businessAccountId', settings.businessAccountId)
        await settingsDb.set('accessToken', settings.accessToken)
        await settingsDb.set('isConnected', settings.isConnected ? 'true' : 'false')
    },
}
