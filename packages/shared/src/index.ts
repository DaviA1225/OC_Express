// Barrel do pacote @sislog/shared. Os apps podem importar daqui ou dos
// subcaminhos (`@sislog/shared/types`, `/validators`, `/formatters`,
// `/postgrest`, `/supabase`) — os subcaminhos evitam carregar o cliente
// Supabase quando só os tipos ou formatadores são necessários.
export * from './database.types'
export * from './validators'
export * from './formatters'
export * from './postgrest'
export * from './supabase'
