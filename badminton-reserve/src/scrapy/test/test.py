# test.py

def add(a, b):
    return a + b

def test_add():
    # ここはわざと間違えた期待値にしておく
    assert add(2, 3) == 5
