import ast

class PyFeatureVisitor(ast.NodeVisitor):
    def __init__(self):
        self.for_count = 0
        self.while_count = 0
        self.max_loop_depth = 0
        self._loop_stack = 0

        self.func_defs = set()
        self.calls = []
        self.has_recursion = 0

        self.imports = set()
        self.list_allocs = 0
        self.dict_allocs = 0
        self.set_allocs = 0

        self.has_sort = 0

    def visit_Import(self, node):
        for a in node.names:
            self.imports.add(a.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module:
            self.imports.add(node.module)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        self.func_defs.add(node.name)
        self.generic_visit(node)

    def _enter_loop(self):
        self._loop_stack += 1
        if self._loop_stack > self.max_loop_depth:
            self.max_loop_depth = self._loop_stack

    def _exit_loop(self):
        self._loop_stack -= 1

    def visit_For(self, node):
        self.for_count += 1
        self._enter_loop()
        self.generic_visit(node)
        self._exit_loop()

    def visit_While(self, node):
        self.while_count += 1
        self._enter_loop()
        self.generic_visit(node)
        self._exit_loop()

    def visit_Call(self, node):
        # detect sort calls: sorted(x) or x.sort()
        if isinstance(node.func, ast.Name) and node.func.id == "sorted":
            self.has_sort = 1
        if isinstance(node.func, ast.Attribute) and node.func.attr == "sort":
            self.has_sort = 1

        # collect call names for recursion detection
        if isinstance(node.func, ast.Name):
            self.calls.append(node.func.id)
        self.generic_visit(node)

    def visit_List(self, node):
        self.list_allocs += 1
        self.generic_visit(node)

    def visit_Dict(self, node):
        self.dict_allocs += 1
        self.generic_visit(node)

    def visit_Set(self, node):
        self.set_allocs += 1
        self.generic_visit(node)

def extract_python_features(code: str) -> dict:
    try:
        tree = ast.parse(code)
    except Exception:
        # If parsing fails, return minimal features
        return {"parse_failed": 1}

    v = PyFeatureVisitor()
    v.visit(tree)

    # recursion detection (simple): function calls itself anywhere
    # (basic version; later improve with per-function scan)
    for f in v.func_defs:
        if f in v.calls:
            v.has_recursion = 1
            break

    alloc_arrays = v.list_allocs + v.dict_allocs + v.set_allocs

    return {
        "parse_failed": 0,
        "for_count": v.for_count,
        "while_count": v.while_count,
        "max_loop_depth": v.max_loop_depth,
        "has_recursion": v.has_recursion,
        "has_sort": v.has_sort,
        "alloc_arrays": alloc_arrays,
        "uses_hashmap": 1 if v.dict_allocs > 0 else 0,
        "uses_graph": 0,  # later detect adjacency patterns
        "imports_count": len(v.imports),
    }
