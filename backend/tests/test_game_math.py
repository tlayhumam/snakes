from app.game import ARENA_HEIGHT, ARENA_WIDTH, GameRoom


def test_new_snakes_spawn_inside_the_arena():
    room = GameRoom("round", 1)
    snake = room._new_snake("p1", "لاعب", "u1", False)
    assert 0 < snake.x < ARENA_WIDTH
    assert 0 < snake.y < ARENA_HEIGHT
    assert len(snake.body) == 28
