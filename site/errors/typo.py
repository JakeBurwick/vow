from dataclasses import dataclass

@dataclass
class User:
    name: str
    email: str

u = User("Ada", "ada@example.com")
print(u.emial)
