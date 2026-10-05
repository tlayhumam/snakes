from app.game import ARENA_HEIGHT, ARENA_WIDTH, GameRoom, Pickup


def test_new_snakes_spawn_inside_the_arena():
    room = GameRoom("round", 1)
    snake = room._new_snake("p1", "لاعب", "u1", False)
    assert 0 < snake.x < ARENA_WIDTH
    assert 0 < snake.y < ARENA_HEIGHT
    assert len(snake.body) == 28


def test_collecting_stars_builds_at_risk_score_and_coin_inventory():
    room = GameRoom("round", 10)
    snake = room._new_snake("p1", "لاعب", "u1", False)
    room.pickups["star"] = Pickup("star", "star", snake.x, snake.y, 12_500)
    room.pickups["coin"] = Pickup("coin", "snk_coin", snake.x, snake.y, 30_000)

    room._collect_pickups(snake)

    assert snake.round_score_micros == 12_500
    assert snake.collected_stars == 1
    assert snake.collected_snk_coins == 1
    assert room.pickups == {}
