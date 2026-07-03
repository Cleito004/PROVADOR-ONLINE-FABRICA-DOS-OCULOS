import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_KEY

let supabase = null
let serviceClient = null

export function initSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Supabase] Credenciais não configuradas. Modo offline.')
    return false
  }
  supabase = createClient(supabaseUrl, supabaseKey)
  serviceClient = supabaseKey
    ? null
    : createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  console.log('[Supabase] Cliente inicializado')
  return true
}

export async function saveSession(sessionId, userId, glassesConfig) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('sessions')
      .upsert({
        id: sessionId,
        user_id: userId,
        glasses_style: glassesConfig.style,
        frame_color: glassesConfig.frameColor,
        lens_color: glassesConfig.lensColor,
        lens_opacity: glassesConfig.lensOpacity,
        updated_at: new Date().toISOString(),
      })
      .select()
    if (error) console.error('[Supabase] Erro ao salvar sessão:', error)
    return data
  } catch (e) {
    console.error('[Supabase] saveSession:', e.message)
    return null
  }
}

export async function saveScreenshot(userId, sessionId, imageUrl) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('screenshots')
      .insert({
        user_id: userId,
        session_id: sessionId,
        image_url: imageUrl,
        created_at: new Date().toISOString(),
      })
      .select()
    if (error) console.error('[Supabase] Erro ao salvar screenshot:', error)
    return data
  } catch (e) {
    console.error('[Supabase] saveScreenshot:', e.message)
    return null
  }
}

export async function getSessions(userId) {
  if (!supabase) return []
  try {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(10)
    return data || []
  } catch {
    return []
  }
}

export function getRealtimeChannel(channelName = 'tryon-global') {
  if (!supabase) return null
  return supabase.channel(channelName, {
    config: { broadcast: { self: true, ack: false } },
  })
}

export { supabase }
