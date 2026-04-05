from unittest.mock import patch, MagicMock
import pytest


@pytest.fixture
def mock_build():
    with patch("backend.services.youtube.build") as mock:
        yield mock


async def test_search_video_returns_url_and_title(mock_build):
    mock_yt = MagicMock()
    mock_build.return_value = mock_yt
    mock_yt.search.return_value.list.return_value.execute.return_value = {
        "items": [
            {
                "id": {"videoId": "abc123"},
                "snippet": {"title": "KB RDL Tutorial Form"},
            }
        ]
    }
    from backend.services.youtube import search_video
    result = await search_video("Romanian Deadlift KB")
    assert result == {
        "url": "https://www.youtube.com/watch?v=abc123",
        "title": "KB RDL Tutorial Form",
    }
    mock_yt.search.return_value.list.assert_called_once_with(
        q="Romanian Deadlift KB tutorial form",
        type="video",
        part="id,snippet",
        maxResults=1,
        videoDuration="medium",
    )


async def test_search_video_returns_none_when_no_results(mock_build):
    mock_yt = MagicMock()
    mock_build.return_value = mock_yt
    mock_yt.search.return_value.list.return_value.execute.return_value = {"items": []}
    from backend.services.youtube import search_video
    result = await search_video("Unknown Exercise XYZ")
    assert result is None


async def test_search_video_returns_none_on_api_error(mock_build):
    mock_build.side_effect = Exception("API quota exceeded")
    from backend.services.youtube import search_video
    result = await search_video("Romanian Deadlift KB")
    assert result is None
