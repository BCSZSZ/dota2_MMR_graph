import requests
import json
from pathlib import Path
from collections import namedtuple
import time


def get_accountID_path(filename="accountID.json"):
    """
    Get the path to the accountID JSON file in the data directory.
    
    Parameters:
    None
    Returns:
    ./data/accountID.json
    """
    return get_data_directory() / filename

def get_player_match_path(playername="maofeng"):
    """    
    Get the path to the playerMatch data file in the data directory.
    create the sub-directory if not exist.
    
    Parameters:
    playername -- str,player's name like maofeng
    Returns:
    ./data/maofeng/matchdata.json
    """ 
    # make sure sub dir exist.
    sub_dir=get_data_directory() / playername
    sub_dir.mkdir(parents=True, exist_ok=True)

    return get_data_directory() / playername/ "matchdata.json"

def get_data_directory():
    """    
    Get the path to the data directory.
    
    Parameters:
    None
    Returns:
    ./data
    """
    current_path = Path(__file__).resolve().parent
    return current_path.parent / "data"

def get_100_rank_match_data_and_save(playerName):
    """    
    get recent 100 ranked match data of the given accout ID,save the data and return it.
    
    Parameters:
    playername -- str,player's name like maofeng
    Returns:
    matches -- matches data in json
    """

    json_path=get_accountID_path()
    with open(json_path, "r") as json_file:
        data = json.load(json_file)        
        
    account_id = data[playerName]
    limit = 100
    lobby_type = 7  # The lobby_type for "ranked" is 7 based on OpenDota's constants

    url = f"https://api.opendota.com/api/players/{account_id}/matches?limit={limit}&lobby_type={lobby_type}"

    response = requests.get(url)
    
    # error handle
    if response.status_code != 200:
        print(f"Failed to fetch data. Status code: {response.status_code}")
        return None
    # happy path
    matches = response.json()
    player_match_path=get_player_match_path(playerName)
    with open(player_match_path, "w") as json_file:
        json.dump(matches, json_file, indent=4)
    print("matches")
    print(matches)
    print(f"Data saved to {json_path} successfully!")
    return matches

def calculate_mmr_history_roughly(matches=None,current_mmr=4670):
    """    
    calculate win lose info from the raw matches json.
    It is a rough calculation, so win and lose is -+25.
    return the mmr.
    Parameters:
    matches100 -- dict,player's matches data request from OpendotaAPI
    Returns:
    mmrList -- list of last 100 mmr.
    """
    
    # test data
    player_match_path=get_player_match_path("maofeng")
    with open(player_match_path, "r") as json_file:
        testMatches = json.load(json_file)
        
    Coordinate = namedtuple("Coordinate", ["timestamp", "mmr"])
    current_timestamp_int = int(time.time())
    start_point = Coordinate(current_timestamp_int, current_mmr)  # 

    # 如果有多个坐标
    points = []
    points.append(start_point)
        
    for match in testMatches:
        if  (match["player_slot"] <=127 and match["radiant_win"] == True) or (match["player_slot"] >=128 and match["radiant_win"] == False):
            current_mmr=current_mmr-25
        else:
            current_mmr=current_mmr+25
        points.append(Coordinate(match["start_time"],current_mmr))
    print("points")
    print(points)
    return points
    #
    
        
def main():
    # who is playing?
    player="maofeng"
    current_mmr=4670
    match_data=get_100_rank_match_data_and_save(player)
    mmr_Points=calculate_mmr_history_roughly(match_data,current_mmr)
    mmr_Points.reverse()
    print(mmr_Points)


if __name__ == "__main__":
    main()
