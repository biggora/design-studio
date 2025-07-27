create or replace function get_random_design()
returns setof design
language sql
as $$
select * from designs
order by random()
    limit 1;
$$;

create or replace function get_random_designs()
returns setof designs
language sql
as $$
select * from designs
order by random()
    limit 3;
$$;