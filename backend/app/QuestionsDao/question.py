# cette classe est pour définir c'est quoi une question d'audit,
# ses attributs sont choisi en tenant compte du document excel de l'anssi
class Question:
    def __init__(self, ref, categorie, chantier, content, markingguide, mark, comment):
        self.ref = ref
        self.categorie = categorie
        self.chantier = chantier
        self.content = content
        self.markingguide = markingguide
        self.mark = mark
        self.comment = comment

    # this one is for testing it prints the dictiannary
    def show(self):
        print(
            f"ref : {self.get_ref()}\nchantier : {self.get_chantier()}\ncategorie : {self.get_categorie()}\nquestion : {self.get_content()},\naide_notation : {self.get_markingguide()}"
        )
