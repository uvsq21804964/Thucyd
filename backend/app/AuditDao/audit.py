from datetime import datetime

from app.QuestionsDao.question import Question

CATEGORY = "cat\u00e9gorie"
MARKING_GUIDE = "aide \u00e0 la notation"
NUMERIC_MARK = "note num\u00e9rique"
STATUS_IN_PROGRESS = "in_progress"
STATUS_FINISHED = "finished"


class Audit:
    def __init__(self, _id, company_name, fiche, started_at: datetime, chef, description=None, datefin=None, list_auditeurs: list | None = None, audit_status: str | None = None):
        self._id = _id
        self.company_name = company_name
        self.fiche = fiche
        self.date = started_at
        self.chef = chef
        self.description = description
        self.datefin = datefin
        self.list_auditeurs = list_auditeurs or []
        if audit_status is None:
            audit_status = STATUS_FINISHED if datefin is not None or self.questionnaire_complete() else STATUS_IN_PROGRESS
        self.status = audit_status

    def get_question(self, ref):
        for data in self.fiche:
            if data["ref"] == ref:
                return Question(ref, data[CATEGORY], data["chantier"], data["question"], data[MARKING_GUIDE], data[NUMERIC_MARK], data["comment"])
        return None

    def set_mark(self, question_ref: int, mark: float):
        for question in self.fiche:
            if question["ref"] == question_ref:
                question[NUMERIC_MARK] = mark
                return True
        return False

    def set_comment(self, question_ref: int, comment: str):
        for question in self.fiche:
            if question["ref"] == question_ref:
                question["comment"] = comment
                return True
        return False

    def set_answer(self, question_ref: int, mark: float, comment: str):
        for question in self.fiche:
            if question["ref"] == question_ref:
                question[NUMERIC_MARK] = mark
                question["comment"] = comment
                return True
        return False
    def set_description(self, description):
        self.description = description

    def incomplete(self):
        count = sum(question[NUMERIC_MARK] is None for question in self.fiche)
        return {"incomplete": count, "total question": len(self.fiche)}

    def questionnaire_complete(self):
        return bool(self.fiche) and all(question[NUMERIC_MARK] is not None for question in self.fiche)

    def finis(self):
        return self.status == STATUS_FINISHED

    def confirmer_terminer(self):
        self.status = STATUS_FINISHED
        self.datefin = datetime.now()

    def CyberScore(self):
        if not self.fiche:
            return 0
        for question in self.fiche:
            if question[NUMERIC_MARK] is None:
                return f"audit incomplet voire la question {question['ref']}"
        return sum(question[NUMERIC_MARK] for question in self.fiche) / len(self.fiche)

    def showinfo(self):
        infos = {
            "_id": str(self._id),
            "companie": self.company_name,
            "description": self.description,
            "chef": self.chef,
            "date": self.date.strftime("%Y-%m-%d"),
            "finished": self.finis(),
            "status": self.status,
            "datefin": self.datefin,
            "auditers": self.list_auditeurs,
        }
        if self.datefin is not None:
            infos["datefin"] = self.datefin.strftime("%Y-%m-%d")
        return infos