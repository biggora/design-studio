DELIMITER $$

-- Both follow the public filter: only active designs.
CREATE PROCEDURE get_random_design()
BEGIN
  SELECT * FROM designs
  WHERE active = 1
  ORDER BY RAND()
  LIMIT 1;
END $$

CREATE PROCEDURE get_random_designs()
BEGIN
  SELECT * FROM designs
  WHERE active = 1
  ORDER BY RAND()
  LIMIT 3;
END $$

DELIMITER ;
