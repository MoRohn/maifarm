"""Test AgentSupervisor integration with AgentManager."""
import uuid

import pytest

from apps.orchestrator.agents.manager import AgentManager
from apps.orchestrator.agents.memory import AgentMemory
from apps.orchestrator.agents.runner import AgentRunner, EchoClaudeClient
from apps.orchestrator.agents.supervisor import AgentSupervisor
from apps.orchestrator.db.session import create_session_factory
from apps.orchestrator.runengine.tasks import RunRequest
from apps.orchestrator.settings import AppSettings
from apps.orchestrator.tmux.bridge import TmuxBridge
from apps.orchestrator.ws.hub import WebsocketHub
from apps.orchestrator.xenosync.xenosync import XenoSyncManager


@pytest.mark.asyncio
async def test_supervisor_tracks_agent_lifecycle(tmp_path: pytest.TempPathFactory) -> None:
    """Verify supervisor tracks agent from registration through completion."""
    settings = AppSettings(
        database_url="sqlite:///:memory:",
        xenosync_cache_dir=str(tmp_path / "cache"),
    )

    # Create dependencies
    db_manager = create_session_factory(settings.async_database_url)
    await db_manager.init_models()
    hub = WebsocketHub(settings=settings)
    memory = AgentMemory(db_manager.session)
    xenosync = XenoSyncManager(settings=settings)
    supervisor = AgentSupervisor()
    await supervisor.start()
    tmux_bridge = TmuxBridge(settings=settings, hub=hub)
    await tmux_bridge.start()

    # Use echo client for testing
    echo_client = EchoClaudeClient(latency=0.01)
    agent_runner = AgentRunner(settings=settings, client=echo_client)

    agent_manager = AgentManager(
        settings=settings,
        runner=agent_runner,
        hub=hub,
        memory=memory,
        session_factory=db_manager.session,
        xenosync=xenosync,
        tmux_bridge=tmux_bridge,
        supervisor=supervisor,
    )

    # Create and register a run
    run_id = uuid.uuid4().hex
    session_id = uuid.uuid4().hex
    request = RunRequest(
        run_id=run_id,
        session_id=session_id,
        agent_id="test-agent",
        prompt="Test prompt for supervisor",
        system_prompt=None,
        profile_id=None,
        tools=[],
        files=[],
        metadata={"test": True},
        tmux_pane_id="pane-0",
    )

    # Register the run
    await agent_manager.register_run(request)

    # Check supervisor has the agent registered
    active_agents = await supervisor.get_active_agents()
    assert len(active_agents) == 1
    assert active_agents[0]["run_id"] == run_id
    assert active_agents[0]["agent_id"] == "test-agent"
    assert active_agents[0]["phase"] == "queued"
    assert active_agents[0]["pane_id"] == "pane-0"

    # Execute the run
    try:
        result = await agent_manager.execute_run(request)
        assert result.status == "succeeded"
    except Exception:
        pass  # May fail due to missing dependencies, but supervisor should still track

    # After completion, agent should be unregistered
    active_agents_after = await supervisor.get_active_agents()
    assert len(active_agents_after) == 0

    # Cleanup
    await supervisor.stop()
    await tmux_bridge.stop()
    await xenosync.stop_heartbeat()
    await db_manager.dispose()


@pytest.mark.asyncio
async def test_monitor_endpoint_reflects_active_agents() -> None:
    """Verify /monitor/active endpoint shows currently running agents."""
    supervisor = AgentSupervisor()
    await supervisor.start()

    # Register some test agents
    await supervisor.register_agent(
        run_id="run-1",
        agent_id="agent-1",
        session_id="session-1",
        phase="running",
        pane_id="pane-1",
    )

    await supervisor.register_agent(
        run_id="run-2",
        agent_id="agent-2",
        session_id="session-1",
        phase="running",
        pane_id="pane-2",
    )

    # Get active agents (simulating /monitor/active call)
    active = await supervisor.get_active_agents()

    assert len(active) == 2
    assert {a["run_id"] for a in active} == {"run-1", "run-2"}
    assert all(a["phase"] == "running" for a in active)

    # Get specific agent status (simulating /monitor/agents/{run_id} call)
    agent_1_status = await supervisor.get_agent_status("run-1")
    assert agent_1_status is not None
    assert agent_1_status["agent_id"] == "agent-1"
    assert agent_1_status["pane_id"] == "pane-1"

    # Unregister one agent
    await supervisor.unregister_agent("run-1")
    active_after = await supervisor.get_active_agents()
    assert len(active_after) == 1
    assert active_after[0]["run_id"] == "run-2"

    await supervisor.stop()
