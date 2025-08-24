import { supabase } from "@/lib/supabaseClient";

export async function saveGameData({
  sessionType,
  hostAddress,
  score,
  hits,
  hitHistory,
  durationSec = 60,
  playerId = null, // for multiplayer
  gameNumber = 1,  // for multiplayer
  sessionId = null, // for multiplayer session management
  allPlayersData = null, // for multiplayer all players data
}) {
  const now = new Date().toISOString();

  // For multiplayer, we need to handle session differently
  if (sessionType === 'multiplayer' && sessionId) {
    // Update existing session end time
    const { error: sessionUpdateError } = await supabase
      .from('game_sessions')
      .update({ ended_at: now })
      .eq('id', sessionId);
    if (sessionUpdateError) throw sessionUpdateError;

    // Insert game result
    const { data: game, error: gameError } = await supabase
      .from('game_results')
      .insert([{ 
        session_id: sessionId, 
        game_number: gameNumber, 
        duration_sec: durationSec,
        ended_at: now 
      }])
      .select()
      .single();
    if (gameError) throw gameError;

    // Insert all players' scores for this game
    if (allPlayersData && allPlayersData.length > 0) {
      const playerScoreRows = allPlayersData.map(playerData => ({
        game_id: game.id,
        player_address: playerData.playerAddress,
        player_id: playerData.playerId,
        final_score: playerData.finalScore,
        total_hits: playerData.totalHits
      }));

      const { data: playerScores, error: playerScoreError } = await supabase
        .from('player_scores')
        .insert(playerScoreRows)
        .select();
      if (playerScoreError) throw playerScoreError;

      // Insert hit history for all players
      for (let i = 0; i < allPlayersData.length; i++) {
        const playerData = allPlayersData[i];
        const playerScore = playerScores[i];
        
        if (playerData.hitHistory && playerData.hitHistory.length > 0) {
          const hitRows = playerData.hitHistory.map(hit => ({
            player_score_id: playerScore.id,
            bird_type: hit.birdType,
            points: hit.points,
            caught_at: new Date(hit.timestamp).toISOString()
          }));
          const { error: hitError } = await supabase.from('hit_history').insert(hitRows);
          if (hitError) throw hitError;
        }
      }
    }
  } else {
    // Single player or new multiplayer session
    // 1. Insert session (ended_at = now since it's the only game)
    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .insert([{ 
        session_type: sessionType, 
        host_address: hostAddress,
        ended_at: now 
      }])
      .select()
      .single();
    if (sessionError) throw sessionError;

    // 2. Insert game result
    const { data: game, error: gameError } = await supabase
      .from('game_results')
      .insert([{ 
        session_id: session.id, 
        game_number: gameNumber, 
        duration_sec: durationSec,
        ended_at: now 
      }])
      .select()
      .single();
    if (gameError) throw gameError;

    // 3. Insert player score
    const { data: playerScore, error: playerScoreError } = await supabase
      .from('player_scores')
      .insert([{
        game_id: game.id,
        player_address: hostAddress,
        player_id: playerId,
        final_score: score,
        total_hits: hits
      }])
      .select()
      .single();
    if (playerScoreError) throw playerScoreError;

    // 4. Insert hit history
    if (hitHistory.length > 0) {
      const hitRows = hitHistory.map(hit => ({
        player_score_id: playerScore.id,
        bird_type: hit.birdType,
        points: hit.points,
        caught_at: new Date(hit.timestamp).toISOString()
      }));
      const { error: hitError } = await supabase.from('hit_history').insert(hitRows);
      if (hitError) throw hitError;
    }

    // Return session ID for multiplayer
    return session.id;
  }
}