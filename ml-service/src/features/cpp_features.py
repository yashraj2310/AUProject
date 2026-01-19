import re
from tree_sitter_languages import get_parser

CPP_PARSER = get_parser("cpp")

def _count_regex(pattern: str, s: str) -> int:
    return len(re.findall(pattern, s, flags=re.MULTILINE))

def extract_cpp_features(code: str) -> dict:
    # quick token heuristics + AST parsing
    tree = CPP_PARSER.parse(bytes(code, "utf8"))
    root = tree.root_node

    # Basic AST walk
    loop_nodes = 0
    max_depth = 0
    sort_calls = 0
    recursion = 0

    func_names = set()

    def walk(node, depth, loop_depth):
        nonlocal loop_nodes, max_depth, sort_calls, recursion, func_names

        # detect function definitions
        if node.type == "function_definition":
            # attempt grab identifier
            # child structure differs; fallback regex too
            pass

        # loop types
        if node.type in ["for_statement", "while_statement", "do_statement"]:
            loop_nodes += 1
            loop_depth += 1
            if loop_depth > max_depth:
                max_depth = loop_depth

        # detect "sort(" call roughly via text slice (cheap)
        if node.type == "call_expression":
            txt = code[node.start_byte:node.end_byte]
            if "sort(" in txt or "stable_sort(" in txt:
                sort_calls = 1

        for ch in node.children:
            walk(ch, depth + 1, loop_depth)

    walk(root, 0, 0)

    # recursion heuristic: function name appears as call (very rough)
    # We'll use regex: find "name(" patterns of defined function names later.
    # For now: detect "return f(" not robust; keep 0.
    recursion = 0

    uses_unordered = 1 if ("unordered_map" in code or "unordered_set" in code) else 0
    uses_map = 1 if ("map<" in code or "set<" in code) else 0
    alloc_arrays = _count_regex(r"\bvector<", code) + _count_regex(r"\bnew\s+", code)
    uses_graph = 1 if ("adj" in code or "graph" in code or "edges" in code) else 0

    return {
        "parse_failed": 0 if root is not None else 1,
        "for_count": _count_regex(r"\bfor\s*\(", code),
        "while_count": _count_regex(r"\bwhile\s*\(", code),
        "max_loop_depth": max_depth,
        "has_recursion": recursion,
        "has_sort": sort_calls,
        "alloc_arrays": alloc_arrays,
        "uses_hashmap": uses_unordered,
        "uses_graph": uses_graph,
        "imports_count": _count_regex(r"#include", code),
    }
