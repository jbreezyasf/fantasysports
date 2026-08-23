create unique index if not exists real_games_provider_game_id_unique_idx
  on public.real_games(provider_game_id)
  where provider_game_id is not null;
