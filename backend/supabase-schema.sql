-- Tabela de sessões do provador virtual
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  glasses_style TEXT DEFAULT 'round',
  frame_color TEXT DEFAULT '#1a1a1a',
  lens_color TEXT DEFAULT '#1a2e1a',
  lens_opacity REAL DEFAULT 0.7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de screenshots salvos
CREATE TABLE IF NOT EXISTS screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshots_user_id ON screenshots(user_id);

-- Habilitar Realtime para as tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE screenshots;

-- Políticas de segurança (RLS)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;

-- Usuários só veem/próprias sessões
CREATE POLICY "Usuários veem próprias sessões"
  ON sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários inserem próprias sessões"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários atualizam próprias sessões"
  ON sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Screenshots
CREATE POLICY "Usuários veem próprios screenshots"
  ON screenshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários inserem próprios screenshots"
  ON screenshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);
