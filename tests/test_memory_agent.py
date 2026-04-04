from unittest.mock import AsyncMock, patch
import pytest


async def test_memory_process_saves_to_db():
    with patch("backend.agents.memory.summarize_and_extract", new_callable=AsyncMock) as mock_extract, \
         patch("backend.agents.memory.save_memory", new_callable=AsyncMock) as mock_save:

        mock_extract.return_value = (
            "Ho mangiato pasta.",
            {"events": ["ho mangiato"], "people": [], "emotions": [], "topics": ["cibo"]}
        )

        from backend.agents.memory import process
        await process("oggi ho mangiato la pasta")

        mock_extract.assert_called_once_with("oggi ho mangiato la pasta")
        mock_save.assert_called_once_with(
            raw_text="oggi ho mangiato la pasta",
            summary="Ho mangiato pasta.",
            entities={"events": ["ho mangiato"], "people": [], "emotions": [], "topics": ["cibo"]}
        )


async def test_memory_process_logs_on_extraction_failure(caplog):
    import logging
    with patch("backend.agents.memory.summarize_and_extract", new_callable=AsyncMock) as mock_extract, \
         patch("backend.agents.memory.save_memory", new_callable=AsyncMock) as mock_save:

        mock_extract.side_effect = ValueError("Extraction fallita")

        from backend.agents.memory import process
        with caplog.at_level(logging.ERROR):
            await process("testo qualsiasi")

        mock_save.assert_not_called()
        assert "Memory Agent error" in caplog.text
