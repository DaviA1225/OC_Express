// Modo ERP, fase 1 (migration 0074).
//
// A preferência mora em `perfis_usuarios.layout_preferido` para seguir a
// pessoa entre computadores — por isso não é localStorage como a densidade.
// O layout EFETIVO só é 'erp' quando o usuário escolheu E ainda tem perfil
// para isso: quem foi rebaixado de analista com o ERP ligado volta sozinho
// ao clássico, sem depender de alguém limpar a coluna.

import * as React from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canUsarLayoutErp } from '@/features/auth/permissions'
import type { LayoutPreferido } from '@/types/database.types'

export function useLayoutPreferido() {
  const { profile, refreshProfile } = useAuth()
  const [salvando, setSalvando] = React.useState(false)

  const podeUsarErp = canUsarLayoutErp(profile)
  const escolhido: LayoutPreferido = profile?.layout_preferido ?? 'classico'
  const modoErp = podeUsarErp && escolhido === 'erp'

  const definir = React.useCallback(
    async (layout: LayoutPreferido) => {
      setSalvando(true)
      try {
        const { error } = await supabase.rpc('definir_meu_layout', { p_layout: layout } as never)
        if (error) throw error
        await refreshProfile()
        toast.success(layout === 'erp' ? 'Modo ERP ligado.' : 'Voltou para o layout clássico.')
      } catch (err) {
        console.error('[layout] definir_meu_layout falhou', err)
        toast.error('Não foi possível trocar o layout. Tente de novo.')
      } finally {
        setSalvando(false)
      }
    },
    [refreshProfile],
  )

  return { modoErp, podeUsarErp, salvando, definir }
}
