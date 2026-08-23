alter table public.franchise_stadium_features
  drop constraint if exists franchise_stadium_features_source_achievement_id_fkey;
alter table public.franchise_stadium_features
  add constraint franchise_stadium_features_source_achievement_id_fkey
  foreign key(source_achievement_id) references public.franchise_achievements(id) on delete cascade;
