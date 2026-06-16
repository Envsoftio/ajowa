drop trigger if exists flat_residents_owner_percentages_complete on flat_residents;

drop function if exists validate_owner_percentages_complete();

drop index if exists flat_residents_one_active_owner_idx;
