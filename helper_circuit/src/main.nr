use dep::std::hash::pedersen_hash;

fn main(
    attacks: [Field; 3],
    defenses: [Field; 3],
    player_address: Field,
    match_id: Field
) -> pub Field {
    pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        match_id
    ])
}