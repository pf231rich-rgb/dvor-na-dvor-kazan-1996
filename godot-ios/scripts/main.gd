extends Node2D

# First playable slice. All graphics are drawn in code so the project
# opens without downloading third-party assets.

const WORLD_W = 960.0
const WORLD_H = 540.0
const PLAYER_SPEED = 210.0
const ENEMY_SPEED = 82.0

var player_pos = Vector2(230, 365)
var enemy_pos = Vector2(660, 365)
var player_hp = 100
var enemy_hp = 100
var facing = 1
var attack_timer = 0.0
var hit_flash = 0.0
var enemy_attack_timer = 0.0
var game_over = false
var win = false
var touch_points = {}
var touch_actions = {}

func _ready():
    OS.window_size = Vector2(WORLD_W, WORLD_H)
    set_process(true)

func _process(delta):
    if game_over:
        update()
        return

    attack_timer = max(0.0, attack_timer - delta)
    enemy_attack_timer = max(0.0, enemy_attack_timer - delta)
    hit_flash = max(0.0, hit_flash - delta)

    var move = Vector2.ZERO
    if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT) or _touch("left"):
        move.x -= 1
    if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT) or _touch("right"):
        move.x += 1
    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP) or _touch("up"):
        move.y -= 1
    if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN) or _touch("down"):
        move.y += 1

    if move.length() > 0.0:
        move = move.normalized()
        player_pos += move * PLAYER_SPEED * delta
        if abs(move.x) > 0.1:
            facing = 1 if move.x > 0 else -1

    player_pos.x = clamp(player_pos.x, 45.0, WORLD_W - 45.0)
    player_pos.y = clamp(player_pos.y, 285.0, 440.0)

    var wants_attack = Input.is_key_pressed(KEY_J) or Input.is_key_pressed(KEY_SPACE) or _touch("attack")
    if wants_attack and attack_timer <= 0.0:
        attack_timer = 0.36
        if abs(enemy_pos.y - player_pos.y) < 48.0 and abs(enemy_pos.x - player_pos.x) < 92.0:
            if sign(enemy_pos.x - player_pos.x) == facing:
                enemy_hp = max(0, enemy_hp - 25)
                hit_flash = 0.12
                if enemy_hp == 0:
                    game_over = true
                    win = true

    if enemy_hp > 0:
        var difference = player_pos - enemy_pos
        if difference.length() > 52.0:
            var enemy_move = difference.normalized()
            enemy_pos += enemy_move * ENEMY_SPEED * delta
            enemy_pos.y = clamp(enemy_pos.y, 285.0, 440.0)
        elif enemy_attack_timer <= 0.0:
            enemy_attack_timer = 1.0
            player_hp = max(0, player_hp - 10)
            if player_hp == 0:
                game_over = true
                win = false

    update()

func _touch(action):
    for id in touch_actions.keys():
        if touch_actions[id] == action:
            return true
    return false

func _input(event):
    if event is InputEventScreenTouch:
        if event.pressed:
            touch_points[event.index] = event.position
            touch_actions[event.index] = _action_at(event.position)
        else:
            touch_points.erase(event.index)
            touch_actions.erase(event.index)
    elif event is InputEventScreenDrag:
        touch_points[event.index] = event.position
        touch_actions[event.index] = _action_at(event.position)

func _action_at(pos):
    var p = get_viewport().get_visible_rect()
    var w = p.size.x
    var h = p.size.y
    var x = pos.x / w
    var y = pos.y / h

    # Left-side directional pad.
    if x < 0.42:
        if y < 0.58:
            return "up"
        if y > 0.82:
            return "down"
        if x < 0.19:
            return "left"
        return "right"

    # Large action buttons on the right.
    if x > 0.78 and y > 0.62:
        return "attack"
    if x > 0.60 and y > 0.72:
        return "block"
    return ""

func _draw():
    var w = get_viewport_rect().size.x
    var h = get_viewport_rect().size.y

    # Evening sky and distant apartment blocks.
    draw_rect(Rect2(0, 0, w, h), Color("#202b3b"))
    draw_rect(Rect2(0, 235, w, 100), Color("#394653"))
    for i in range(6):
        var bx = i * 180 - 20
        draw_rect(Rect2(bx, 115, 135, 220), Color("#59616a"))
        for row in range(5):
            for col in range(3):
                draw_rect(Rect2(bx + 14 + col * 38, 132 + row * 36, 19, 22), Color("#e2b875") if (i + row + col) % 3 == 0 else Color("#273441"))
        draw_rect(Rect2(bx + 58, 275, 28, 60), Color("#303b46"))

    # Yard ground and asphalt lane.
    draw_rect(Rect2(0, 335, w, 205), Color("#526047"))
    draw_rect(Rect2(0, 455, w, 85), Color("#34383d"))
    for x in range(0, int(w), 100):
        draw_rect(Rect2(x, 453, 48, 3), Color("#c5b68a"))

    # Garage and yard details.
    draw_rect(Rect2(38, 295, 145, 78), Color("#59636a"))
    draw_rect(Rect2(50, 315, 120, 58), Color("#27313a"))
    draw_rect(Rect2(56, 321, 108, 52), Color("#78818a"))
    draw_rect(Rect2(56, 321, 108, 7), Color("#aeb5b8"))
    draw_rect(Rect2(790, 318, 110, 55), Color("#8c4638"))
    draw_rect(Rect2(800, 328, 90, 45), Color("#303840"))

    _draw_fighter(enemy_pos, false, enemy_hp <= 0)
    _draw_fighter(player_pos, true, false)

    # Health bars.
    draw_string(get_font("font"), Vector2(32, 35), "ВО ДВОРЕ  /  КАЗАНЬ 1996", Color("#f1dfb6"))
    draw_string(get_font("font"), Vector2(32, 65), "ТЫ", Color("#ffffff"))
    draw_rect(Rect2(78, 48, 220, 17), Color("#22252b"))
    draw_rect(Rect2(80, 50, 216 * player_hp / 100.0, 13), Color("#4ebd75"))
    draw_string(get_font("font"), Vector2(w - 285, 65), "СОПЕРНИК", Color("#ffffff"))
    draw_rect(Rect2(w - 165, 48, 130, 17), Color("#22252b"))
    draw_rect(Rect2(w - 163, 50, 126 * enemy_hp / 100.0, 13), Color("#d35b4d"))

    # Touch controls.
    _draw_button(Vector2(105, h - 95), "◀")
    _draw_button(Vector2(205, h - 95), "▶")
    _draw_button(Vector2(155, h - 155), "▲")
    _draw_button(Vector2(155, h - 35), "▼")
    _draw_button(Vector2(w - 100, h - 95), "УДАР")
    _draw_button(Vector2(w - 220, h - 55), "БЛОК")

    if game_over:
        draw_rect(Rect2(0, 0, w, h), Color(0, 0, 0, 0.68))
        var message = "ДВОР ЗА НАМИ!" if win else "ТЕБЯ ПОБЕДИЛИ"
        draw_string(get_font("font"), Vector2(w / 2 - 115, h / 2), message, Color("#f5dfae"))
        draw_string(get_font("font"), Vector2(w / 2 - 100, h / 2 + 38), "НАЖМИ R, ЧТОБЫ ПОВТОРИТЬ", Color("#ffffff"))

func _draw_button(center, label):
    draw_circle(center, 37, Color(0.08, 0.10, 0.13, 0.68))
    draw_arc(center, 37, 0, PI * 2, 32, Color("#c9c2ad"), 2.0)
    draw_string(get_font("font"), center + Vector2(-22, 7), label, Color("#ffffff"))

func _draw_fighter(pos, is_player, defeated):
    if defeated:
        return
    var body = Color("#315f9b") if is_player else Color("#a84c3f")
    var skin = Color("#d8a77d")
    var x = pos.x
    var y = pos.y
    # Shadow.
    draw_ellipse(Rect2(x - 23, y + 17, 46, 10), Color(0, 0, 0, 0.35))
    # Legs and shoes.
    draw_rect(Rect2(x - 14, y - 10, 11, 28), Color("#20232a"))
    draw_rect(Rect2(x + 3, y - 10, 11, 28), Color("#20232a"))
    draw_rect(Rect2(x - 18, y + 13, 17, 7), Color("#17191d"))
    draw_rect(Rect2(x + 1, y + 13, 17, 7), Color("#17191d"))
    # Jacket and head.
    draw_rect(Rect2(x - 19, y - 48, 38, 40), body)
    draw_rect(Rect2(x - 13, y - 70, 26, 23), skin)
    draw_rect(Rect2(x - 15, y - 74, 30, 9), Color("#30251f"))
    # Pixel highlights.
    draw_rect(Rect2(x - 13, y - 42, 6, 18), Color(1, 1, 1, 0.16))
    draw_rect(Rect2(x + 8, y - 36, 5, 5), Color("#d8d0b5"))

func _unhandled_key_input(event):
    if event is InputEventKey and event.pressed and event.scancode == KEY_R and game_over:
        player_pos = Vector2(230, 365)
        enemy_pos = Vector2(660, 365)
        player_hp = 100
        enemy_hp = 100
        game_over = false
        win = false
