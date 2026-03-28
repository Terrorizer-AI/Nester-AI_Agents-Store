"""
GitHub Monitor agent nodes — auto-register all node factories on import.
"""

from nodes.github.event_collector import *         # noqa: F401,F403
from nodes.github.security_analyzer import *       # noqa: F401,F403
from nodes.github.productivity_analyzer import *   # noqa: F401,F403
from nodes.github.intelligence_synthesizer import *  # noqa: F401,F403
from nodes.github.action_dispatcher import *       # noqa: F401,F403
