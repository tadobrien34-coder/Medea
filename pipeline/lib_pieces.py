def pieceName(pk, origin):
    """Human name for a piece from the square it started on, e.g. ('N', 'g8') -> "king's knight"."""
    f, r = ord(origin[0]) - 97, int(origin[1])
    if pk == 'N':
        return "queen's knight" if f <= 3 else "king's knight"
    if pk == 'R':
        return "queen's rook" if f <= 3 else "king's rook"
    if pk == 'B':
        return 'dark-squared bishop' if (f + r) % 2 == 1 else 'light-squared bishop'
    if pk == 'P':
        return f'{origin[0]}-pawn'
    return {'Q': 'queen', 'K': 'king'}.get(pk, pk)
