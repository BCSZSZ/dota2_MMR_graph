import requests
import json
from pathlib import Path
from collections import namedtuple
import time
import matplotlib.pyplot as plt
from datetime import datetime
import random
import matplotlib.dates as mdates

def generate_noise(num_points=100, noise_range=(-5, 5)):
    """generate a noise in range of -+5. since we are not accurate at the first place, no harm doing that.

    Args:
        num_points (int, optional): we get 100 matches, so it is 100. Defaults to 100.
        noise_range (tuple, optional): -+5range. Defaults to (-5, 5).

    Returns:
        noise: a -+5 list.
    """
    # Generate num_points-1 random numbers within the noise range
    noise = [random.randint(noise_range[0], noise_range[1]) for _ in range(num_points - 1)]
    
    # Ensure the sum of all noises is 0 by setting the last noise value
    noise.append(-sum(noise))
    
    return noise

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
    print(url)
    response = requests.get(url)
    
    # error handle
    if response.status_code != 200:
        print(f"Failed to fetch data. Status code: {response.status_code}")
        return None
    # happy path
    matches = response.json()
    matches.reverse()
    match_count=len(matches)
    player_match_path=get_player_match_path(playerName)
    with open(player_match_path, "w") as json_file:
        json.dump(matches, json_file, indent=4)
    print("matches")
    print(f"{match_count} matches are read")
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
    Coordinate = namedtuple("Coordinate", ["timestamp", "mmr"])
    current_timestamp_int = int(time.time())
    start_point = Coordinate(current_timestamp_int, current_mmr)  # 


    points = []
    points.append(start_point)
        
    # add some noise just for fun
    noise=generate_noise()
    for i in range(len(matches)):
        if  (matches[i]["player_slot"] <=127 and matches[i]["radiant_win"] == True) or (matches[i]["player_slot"] >=128 and matches[i]["radiant_win"] == False):
            current_mmr=current_mmr-25+noise[i]
        else:
            current_mmr=current_mmr+25+noise[i]
        points.append(Coordinate(matches[i]["start_time"],current_mmr))
    print("points")
    print(points)
    points.reverse()
    return points
    #
    
def plot_mmr_over_time_and_save(coordinates,player_name):
    # Extract timestamps and MMRs from the named tuples
    timestamps = [point.timestamp for point in coordinates]
    mmrs = [point.mmr for point in coordinates]

    # Convert timestamps to datetime objects
    dates = [datetime.utcfromtimestamp(ts) for ts in timestamps]

    # Plotting using matplotlib
    plt.figure(figsize=(12, 6))
    plt.plot(dates, mmrs, marker='o', linestyle='-')
    
    # Formatting the x-axis for dates
    plt.gca().xaxis.set_major_formatter(mdates.DateFormatter('%Y/%m/%d %H:%M:%S'))
    plt.gca().xaxis.set_major_locator(mdates.AutoDateLocator())
    plt.xticks(rotation=45)  # Rotate x-axis labels for better visibility

    plt.xlabel('Date (YYYY/MM/DD HH:MM:SS)')
    plt.ylabel('MMR')
    plt.title('MMR Over Time')
    plt.tight_layout()
    plt.grid(True)  # Add grid lines
   
    # save to player data
    current_time = datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
    sub_dir=get_data_directory() / player_name
    sub_dir.mkdir(parents=True, exist_ok=True)
    filename = get_data_directory() / player_name/ f"{current_time}.png"
    plt.savefig(filename,dpi=1080)
    plt.show()
        
def calculate_win_rate_and_others_and_save(playerName,matches=None):
    """calculate or collect some figure based on the match data
    for now I think the following should be noted.
    1 solo rank count
    2 party rank count
    3 solo rank win rate
    4 party rank win rate
    5 first match date
    
    the following should be interesting but not this time
    all unique heroes played
    most played hero and count
    top win rate hero
    
    

    Args:
        matches (list, optional): recent 100 rank match data. Defaults to None.
    """
    win_rate=0
    solo_rank_win_rate=0
    party_rank_win_rate=0
    unknown_rank_win_rate=0
    first_match_date=0
    solo_rank_count=0
    party_rank_count=0
    unknown_rank_count=0
    
    solo_win_count=0
    solo_lose_count=0
    party_win_count=0
    party_lose_count=0
    unknown_win_count=0
    unknown_lose_count=0
    match_count=len(matches)
    for i in range(len(matches)):
        if  (matches[i]["player_slot"] <=127 and matches[i]["radiant_win"] == True) or (matches[i]["player_slot"] >=128 and matches[i]["radiant_win"] == False):
            if matches[i]["party_size"] ==None:
                unknown_rank_count=unknown_rank_count+1
                unknown_win_count=unknown_win_count+1
            if matches[i]["party_size"] ==1:
                solo_rank_count=solo_rank_count+1
                solo_win_count=solo_win_count+1
            if matches[i]["party_size"]  in (2,3,4,5):
                party_rank_count=party_rank_count+1
                party_win_count=party_win_count+1
        else:
            if matches[i]["party_size"] ==None:
                unknown_rank_count=unknown_rank_count+1
                unknown_lose_count=unknown_lose_count+1
            if matches[i]["party_size"] ==1:
                solo_rank_count=solo_rank_count+1
                solo_lose_count=solo_lose_count+1
            if matches[i]["party_size"] in (2,3,4,5):
                party_rank_count=party_rank_count+1
                party_lose_count=party_lose_count+1
        if i == 1:
            first_match_date=matches[i]["start_time"]
    
    if solo_rank_count!=0:
        solo_rank_win_rate=solo_win_count/solo_rank_count*100
    if party_rank_count!=0:
        party_rank_win_rate=party_win_count/party_rank_count*100
    if unknown_rank_count!=0:
        unknown_rank_win_rate=unknown_win_count/unknown_rank_count*100
    win_rate=(solo_win_count+party_win_count+unknown_win_count)/(solo_rank_count+party_rank_count+unknown_rank_count)*100
    
    dt_object = datetime.utcfromtimestamp(first_match_date)
    formatted_date = dt_object.strftime('%Y/%m/%d %H:%M:%S') 
    
    print(f"当前政审的是{playerName}")
    print(f"本次读取了{match_count}条天梯比赛数据。")
    print(f"其中，最早的一把是{formatted_date}打的")
    print(f"{playerName}的总体胜率是 {win_rate}%")
    print(f"{playerName}的单排把数是 {solo_rank_count}把")
    if solo_rank_count!=0:
        print(f"{playerName}的单排胜率是 {solo_rank_win_rate}%")
    print(f"{playerName}的组排把数是 {party_rank_count}把")
    if party_rank_count!=0:
        print(f"{playerName}的组排胜率是 {party_rank_win_rate}%")
    print(f"{playerName}的组队状态不明天梯比赛把数是 {unknown_rank_count}把")
    if unknown_rank_count!=0:
        print(f"{playerName}的组队状态不明天体比赛胜率是 {unknown_rank_win_rate}%")
    
    
    

def main():
    # who is playing?
    player="caozei"
    current_mmr=4670
    #
    
    # get and save match data
    match_data=get_100_rank_match_data_and_save(player)
    #
    
    # calculate some stats based on the match data.
    
    calculate_win_rate_and_others_and_save(player,match_data)
    
    
    
    # # calculate rough mmr history and plot it.
    # mmr_Points=calculate_mmr_history_roughly(match_data,current_mmr)
    # plot_mmr_over_time_and_save(mmr_Points,player)
    # #
    
    
    
    

if __name__ == "__main__":
    main()
